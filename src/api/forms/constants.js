export const makeFormLiveErrorMessages = {
  missingDraft: 'This form is already live. Create a new draft to change the form.',
  missingStartPage: 'The questions in this form are not all connected. Connect all pages within the form.',
  missingOutputEmail:
    'The draft form does not contain an output email address. Add an output email address for forms to be sent to.',
  missingContact: 'You must provide at least one way for users to get help before you make this form live.',
  missingSubmissionGuidance:
    'You need to tell your users what happens after they submit their form before you can make it live.',
  missingPrivacyNotice: 'You need to add a link to the privacy notice before you can publish this form.'
}

export const removeFormErrorMessages = {
  formIsAlreadyLive: 'This form has already gone live and cannot be deleted.'
}
