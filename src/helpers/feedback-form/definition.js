/**
 * Feedback form
 * This form definition is reinstated whenever the forms-manmager service startups up.
 * Be aware that any changes to this file will result in changes across all environments as deployments happen.
 */
export const feedbackDefinition = /** @type {FormDefinition} */ ({
  name: 'User feedback',
  engine: 'V2',
  schema: 2,
  startPage: '/give-feedback',
  pages: [
    {
      title: 'Give feedback',
      path: '/give-feedback',
      components: [
        {
          type: 'RadiosField',
          title: 'Overall, how do you feel about the service you received today?',
          name: 'PMPyjg',
          shortDescription: 'How you feel about the service',
          hint: '',
          options: {
            required: true
          },
          schema: {},
          list: '7acae132-d54d-4663-929d-04a1ed4d35d3',
          id: 'b5c525db-068e-4f05-818a-7ef57303f8b5'
        },
        {
          type: 'MultilineTextField',
          title: 'How could we improve this service?',
          name: 'AiBocn',
          shortDescription: 'How we could improve this service',
          hint: '',
          options: {
            required: false
          },
          schema: {
            max: 1200
          },
          id: '57c2b549-e152-469f-9250-865ce5a4de23'
        },
        {
          type: 'HiddenField',
          title: 'Hidden form id',
          name: 'formId',
          options: {
            required: false
          },
          id: '5ab73ef3-bce4-41a6-a8ae-9525160c36ed',
          schema: {}
        }
      ],
      next: [],
      id: '4af5213f-0373-43b9-b32f-0ee822d37860',
      controller: 'FeedbackPageController'
    },
    {
      id: '449a45f6-4541-4a46-91bd-8b8931b07b50',
      title: '',
      path: '/summary',
      controller: 'SummaryPageWithConfirmationEmailController',
      // @ts-expect-error - extra property gets saved
      next: []
    }
  ],
  conditions: [],
  sections: [],
  lists: [
    {
      name: 'hgNvNj',
      title: 'List for question PMPyjg',
      type: 'string',
      items: [
        {
          id: '24c89938-25e6-4cfa-99c6-f84609dd1bd2',
          text: 'Very satisfied',
          value: 'Very satisfied'
        },
        {
          id: '631bcf2f-ba78-4627-9e1b-e9f1030dc0e0',
          text: 'Satisfied',
          value: 'Satisfied'
        },
        {
          id: 'ee4db6ec-7246-430e-8dd2-e24cf4c34376',
          text: 'Neither satisfied nor dissatisfied',
          value: 'Neither satisfied nor dissatisfied'
        },
        {
          id: '3b720c19-e580-405d-81ca-189452e9d873',
          text: 'Dissatisfied',
          value: 'Dissatisfied'
        },
        {
          id: '4f4c7e11-f27a-470d-a366-48dd9a25f24c',
          text: 'Very dissatisfied',
          value: 'Very dissatisfied'
        }
      ],
      id: '7acae132-d54d-4663-929d-04a1ed4d35d3'
    }
  ]
})

/**
 * @import { FormDefinition } from '@defra/forms-model'
 */
