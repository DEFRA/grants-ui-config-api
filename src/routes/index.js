import components from '~/src/routes/components.js'
import conditions from '~/src/routes/conditions.js'
import forms from '~/src/routes/forms.js'
import health from '~/src/routes/health.js'
import lists from '~/src/routes/lists.js'
import options from '~/src/routes/options.js'
import pages from '~/src/routes/pages.js'
import sections from '~/src/routes/sections.js'

export default [health, forms, pages, components, lists, conditions, options, sections].flat()
