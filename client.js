let inputType = 'text'
const choiceInputName = 'choices[]'

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
    newInput.setAttribute('type', inputType)
    addButton.parentNode.insertBefore(newInput, addButton)
  })
  addButton.appendChild(document.createTextNode('Add Option'))
  submitButton.parentNode.insertBefore(addButton, submitButton)

  const toggleButton = document.createElement('button')
  toggleButton.appendChild(document.createTextNode('Change Mode'))
  toggleButton.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    const newInputType = inputType === 'text' ? 'datetime-local' : 'text'
    for (const existing of document.querySelectorAll(`input[name="${choiceInputName}"]`)) {
      const replacement = document.createElement('input')
      replacement.setAttribute('name', choiceInputName)
      replacement.setAttribute('type', newInputType)
      const parent = existing.parentNode
      parent.insertBefore(replacement, existing)
      parent.removeChild(existing)
    }
    inputType = newInputType
  })
  submitButton.parentNode.insertBefore(toggleButton, submitButton)
})
