const Busboy = require('busboy')
const FormData = require('form-data')
const assert = require('assert')
const basicAuth = require('basic-auth')
const commonmark = require('commonmark')
const crypto = require('crypto')
const doNotCache = require('do-not-cache')
const fs = require('fs')
const http = require('http')
const https = require('https')
const jsonfile = require('jsonfile')
const mustache = require('mustache')
const os = require('os')
const path = require('path')
const pino = require('pino')
const pinoHTTP = require('pino-http')
const rimraf = require('rimraf')
const runParallel = require('run-parallel')
const runParallelLimit = require('run-parallel-limit')
const runSeries = require('run-series')
const schedule = require('node-schedule')
const simpleConcat = require('simple-concat')

const DIRECTORY = process.env.DIRECTORY || 'approval-data'
const HOSTNAME = process.env.HOSTNAME || os.hostname()
const PASSWORD = process.env.PASSWORD || 'approval'
const USERNAME = process.env.USERNAME || 'approval'

const logger = pino()

process
  .on('SIGTERM', shutdown)
  .on('SIGQUIT', shutdown)
  .on('SIGINT', shutdown)
  .on('uncaughtException', function (error) {
    logger.error(error, 'uncaughtException')
    shutdown()
  })

const ID_BYTES = 16

const ID_RE = new RegExp('^/([a-f0-9]{' + (ID_BYTES * 2) + '})$')

const addLoggers = pinoHTTP({ logger })

const server = http.createServer(function (request, response) {
  addLoggers(request, response)
  const url = request.url
  if (url === '/') return index(request, response)
  if (url === '/styles.css') return serveFile(request, response)
  if (url === '/client.js') return serveFile(request, response)
  const match = ID_RE.exec(url)
  if (match) vote(request, response, match[1])
  else notFound(request, response)
})

function index (request, response) {
  doNotCache(response)
  const method = request.method
  const auth = basicAuth(request)
  if (!auth || auth.name !== USERNAME || auth.pass !== PASSWORD) {
    response.statusCode = 401
    response.setHeader('WWW-Authenticate', 'Basic realm="Approval"')
    return response.end()
  }
  if (method === 'GET') getIndex(request, response)
  else if (method === 'POST') postIndex(request, response)
  else methodNotAllowed(request, response)
}

function getIndex (request, response) {
  renderMustache('index.html', {}, function (error, html) {
    if (error) return internalError(request, response, error)
    response.setHeader('Content-Type', 'text/html')
    response.end(html)
  })
}

function postIndex (request, response) {
  let title
  const choices = []
  request.pipe(
    new Busboy({ headers: request.headers })
      .on('field', function (name, value) {
        if (!value) return
        if (name === 'title') title = value
        if (name === 'choices[]') choices.push(value)
      })
      .once('finish', function () {
        request.log.info({ title, choices }, 'inputs')
        createID(function (error, id) {
          if (error) return internalError(request, response, error)
          request.log.info({ id }, 'id')
          if (!title || choices.length === 0) {
            response.statusCode = 400
            return response.end()
          }
          const date = dateString()
          const data = { date, title, choices }
          const votePath = joinVotePath(id)
          runSeries([
            function (done) {
              fs.mkdir(dataPath(id), { recursive: true }, done)
            },
            function (done) {
              fs.writeFile(votePath, JSON.stringify(data), 'utf8', done)
            }
          ], function (error) {
            if (error) return internalError(request, response, error)
            response.setHeader('Location', '/' + id)
            response.statusCode = 303
            response.end()
          })
        })
      })
  )
}

function createID (callback) {
  crypto.randomBytes(ID_BYTES, function (error, buffer) {
    if (error) return callback(error)
    callback(null, buffer.toString('hex'))
  })
}

function serveFile (request, response) {
  const basename = path.basename(request.url)
  const filePath = packagePath(basename)
  fs.createReadStream(filePath).pipe(response)
}

function methodNotAllowed (request, response) {
  response.statusCode = 405
  response.end()
}

function vote (request, response, id) {
  const method = request.method
  if (method === 'GET') getVote(request, response, id)
  else if (method === 'POST') postVote(request, response, id)
  else methodNotAllowed(request, response)
}

function getVote (request, response, id) {
  doNotCache(response)
  readVoteData(id, function (error, data) {
    if (error) {
      if (error.code === 'ENOENT') return notFound(request, response)
      else return internalError(request, response, error)
    }
    data.markdownChoices = data.choices.map(function (choice) {
      const reader = new commonmark.Parser()
      const writer = new commonmark.HtmlRenderer()
      const parsed = reader.parse(choice)
      return writer.render(parsed)
    })
    renderMustache('vote.html', data, function (error, html) {
      if (error) return internalError(request, response, error)
      response.setHeader('Content-Type', 'text/html')
      response.end(html)
    })
  })
}

function postVote (request, response, id) {
  doNotCache(response)
  let responder
  const choices = []
  request.pipe(new Busboy({ headers: request.headers })
    .on('field', function (name, value) {
      if (!value) return
      if (name === 'responder') responder = value
      if (name === 'choices[]') choices.push(value)
    })
    .once('finish', function () {
      request.log.info({ responder, choices }, 'data')
      const date = dateString()
      const line = JSON.stringify([date, responder, choices])
      const responsesPath = joinResponsesPath(id)
      fs.appendFile(responsesPath, line + '\n', function (error) {
        if (error) return internalError(request, response, error)
        renderMustache('voted.html', {}, function (error, html) {
          if (error) return internalError(request, response, error)
          response.end(html)
        })
        readVoteData(id, function (error, data) {
          if (error) return logger.error(error, 'readVoteData')
          const title = data.title
          mail({
            subject: 'Response to "' + title + '"',
            text: [
              '"' + responder + '" responded to ' +
              '"' + title + '".',
              HOSTNAME + '/' + id
            ]
          }, function (error) {
            if (error) logger.error(error, 'mail')
          })
        })
      })
    }))
}

function readVoteData (id, callback) {
  runParallel({
    vote: function (done) {
      jsonfile.readFile(joinVotePath(id), done)
    },
    responses: function (done) {
      const responsesPath = joinResponsesPath(id)
      fs.readFile(responsesPath, 'utf8', function (error, ndjson) {
        if (error) {
          if (error.code === 'ENOENT') ndjson = ''
          else return callback(error)
        }
        done(null, ndjson
          .split('\n')
          .map(function (line) {
            let data
            try {
              data = JSON.parse(line)
            } catch (error) {
              return null
            }
            return {
              date: data[0],
              responder: data[1],
              choices: data[2]
            }
          })
          .filter(function (x) {
            return x !== null
          })
        )
      })
    }
  }, function (error, results) {
    if (error) return callback(error)
    callback(null, {
      title: results.vote.title,
      choices: results.vote.choices,
      responses: results.responses
    })
  })
}

function joinResponsesPath (id) {
  return path.join(dataPath(id), 'responses.ndjson')
}

function joinVotePath (id) {
  return path.join(dataPath(id), 'vote.json')
}

function notFound (request, response) {
  response.statusCode = 404
  response.end('Not found.')
}

function internalError (request, response, error) {
  request.log.error(error)
  response.statusCode = 500
  response.end()
}

function shutdown () {
  server.close(function () {
    process.exit()
  })
}

server.listen(process.env.PORT || 8080)

const CONCURRENCY_LIMIT = 3

schedule.scheduleJob('0 * * * *', deleteOldVotes)

deleteOldVotes()

function deleteOldVotes () {
  fs.readdir(DIRECTORY, function (error, entries) {
    if (error) return logger.error(error, 'deleteOldVotes readdir')
    runParallelLimit(entries.map(function (id) {
      return function (done) {
        const directory = path.join(DIRECTORY, id)
        const votePath = joinVotePath(id)
        jsonfile.readFile(votePath, function (error, vote) {
          if (error) return logger.error(error, 'deleteOldVotes readFile')
          if (!old(vote.date)) return
          rimraf(directory, function (error) {
            logger.info({ id }, 'deleteOldVotes deleted')
            if (error) logger.error(error, 'deleteOldVotes rimraf')
          })
        })
      }
    }), CONCURRENCY_LIMIT)
  })
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

function old (created) {
  return (new Date() - new Date(created)) > THIRTY_DAYS
}

function dateString () {
  return new Date().toISOString()
}

function mail (message, callback) {
  assert(typeof message.subject === 'string')
  assert(Array.isArray(message.text))
  assert(message.text.every(function (element) {
    return typeof element === 'string'
  }))
  assert(typeof callback === 'function')
  if (
    !process.env.MAILGUN_FROM ||
    !process.env.EMAIL_TO ||
    !process.env.MAILGUN_DOMAIN ||
    !process.env.MAILGUN_KEY
  ) return callback()
  const form = new FormData()
  form.append('from', process.env.MAILGUN_FROM)
  form.append('to', process.env.EMAIL_TO)
  form.append('subject', message.subject)
  form.append('o:dkim', 'yes')
  form.append('text', message.text.join('\n\n'))
  const options = {
    method: 'POST',
    host: 'api.mailgun.net',
    path: '/v3/' + process.env.MAILGUN_DOMAIN + '/messages',
    auth: 'api:' + process.env.MAILGUN_KEY,
    headers: form.getHeaders()
  }
  form.pipe(
    https.request(options)
      .once('error', callback)
      .once('response', function (response) {
        const status = response.statusCode
        if (status === 200) return callback()
        simpleConcat(response, function (error, body) {
          if (error) return callback(error)
          callback(body.toString())
        })
      })
  )
}

function renderMustache (templateFile, view, callback) {
  runParallel({
    rendered: loadFile(templateFile),
    head: loadPartial('head'),
    footer: loadPartial('footer')
  }, function (error, templates) {
    if (error) return callback(error)
    const html = mustache.render(templates.rendered, view, templates)
    callback(null, html)
  })

  function loadPartial (baseName) {
    return loadFile('_' + baseName + '.html')
  }

  function loadFile (name) {
    return function (done) {
      fs.readFile(packagePath(name), 'utf8', done)
    }
  }
}

function dataPath (fileName) {
  return path.join(DIRECTORY, fileName)
}

function packagePath (fileName) {
  return path.join(__dirname, fileName)
}
