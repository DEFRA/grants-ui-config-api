import { config } from 'dotenv'

// Increase max listeners to avoid memory leak warnings in integration tests
// This is set globally for all tests to prevent warnings from Jest plugins
// and multiple event handlers registering on process events
// Setting to 0 means unlimited listeners (no warnings)
process.setMaxListeners(0)

config({ path: '.env.test', override: true })
