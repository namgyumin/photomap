const baseConfig = require('./app.json')

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || ''

module.exports = ({ config }) => ({
  ...config,
  ...baseConfig.expo,
  extra: {
    ...baseConfig.expo.extra,
    googleMapsApiKey,
  },
  ios: {
    ...baseConfig.expo.ios,
    config: {
      ...baseConfig.expo.ios?.config,
      googleMapsApiKey,
    },
  },
  android: {
    ...baseConfig.expo.android,
    config: {
      ...baseConfig.expo.android?.config,
      googleMaps: {
        ...baseConfig.expo.android?.config?.googleMaps,
        apiKey: googleMapsApiKey,
      },
    },
  },
  plugins: baseConfig.expo.plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
      return [
        plugin[0],
        {
          ...plugin[1],
          googleMapsApiKey,
        },
      ]
    }

    return plugin
  }),
})
