let inputType = 'text'

document.addEventListener('DOMContentLoaded', () => {
  const submitButton = document.getElementById('submit')
  if (!submitButton) return
  const template = document.getElementById('choice')
  const addP = document.createElement('p')
  const addButton = document.createElement('button')
  addP.appendChild(addButton)
  addButton.type = 'button'
  addButton.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    const clone = document.importNode(template.content, true)
    addButton.parentNode.insertBefore(clone, addButton)
  })
  addButton.appendChild(document.createTextNode('Add Option'))
  submitButton.parentNode.insertBefore(addP, submitButton)
  const toggleButton = document.createElement('button')
  toggleButton.appendChild(document.createTextNode('Change Mode'))
  toggleButton.addEventListener('click', toggleMode)
  submitButton.parentNode.insertBefore(toggleButton, submitButton)
})

const name = 'choices[]'

function toggleMode () {
  const newInputType = inputType === 'text' ? 'date' : 'text'
  for (const existing of document.querySelectorAll(`input[name="${name}"]`)) {
    const replacement = document.createElement('input')
    replacement.setAttribute('name', name)
    replacement.setAttribute('type', newInputType)
    const parent = existing.parentNode
    parent.insertBefore(replacement, existing)
    parent.removeChild(existing)
  }
  inputType = newInputType
}
