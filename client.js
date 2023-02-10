const choiceInputName = 'choices[]'
const inputType = 'input[name=inputType]'

document.addEventListener('DOMContentLoaded', () => {
  const submitButton = document.getElementById('submit')
  if (!submitButton) return

  const addButton = document.createElement('button')
  addButton.type = 'button'
  addButton.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    const newInput = document.createElement('input')
    newInput.setAttribute('name', choiceInputName)
    newInput.setAttribute('type', document.querySelector(inputType).value)
    addButton.parentNode.insertBefore(newInput, addButton)
  })
  addButton.appendChild(document.createTextNode('Add Option'))
  submitButton.parentNode.insertBefore(addButton, submitButton)

  const toggleButton = document.createElement('button')
  toggleButton.appendChild(document.createTextNode('Change Mode'))
  toggleButton.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    const newInputType = document.querySelector(inputType).value === 'text' ? 'datetime-local' : 'text'
    for (const existing of document.querySelectorAll(`input[name="${choiceInputName}"]`)) {
      const replacement = document.createElement('input')
      replacement.setAttribute('name', choiceInputName)
      replacement.setAttribute('type', newInputType)
      const parent = existing.parentNode
      parent.insertBefore(replacement, existing)
      parent.removeChild(existing)
    }
    document.querySelector(inputType).setAttribute('value', newInputType)
  })
  submitButton.parentNode.insertBefore(toggleButton, submitButton)
})
