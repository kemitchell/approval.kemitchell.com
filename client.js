document.addEventListener('DOMContentLoaded', function () {
  const submitButton = document.getElementById('submit')
  if (!submitButton) return
  const template = document.getElementById('choice')
  const addP = document.createElement('p')
  const addButton = document.createElement('button')
  addP.appendChild(addButton)
  addButton.type = 'button'
  addButton.addEventListener('click', function (event) {
    event.preventDefault()
    event.stopPropagation()
    const clone = document.importNode(template.content, true)
    addButton.parentNode.insertBefore(clone, addButton)
  })
  addButton.appendChild(document.createTextNode('Add Option'))
  submitButton.parentNode.insertBefore(addP, submitButton)
})
