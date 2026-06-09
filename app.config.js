const baseConfig = require('./app.json')

const androidMapsKey = process.env.ANDROID_MAPS_KEY || ''
const iosMapsKey = process.env.IOS_MAPS_KEY || ''

const basePlugins = baseConfig.expo.plugins || []
const plugins = basePlugins.map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
    return [
      plugin[0],
      {
        ...plugin[1],
        googleMapsApiKey: androidMapsKey,
      },
    ]
  }

  return plugin
})

if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-splash-screen')) {
  plugins.push('expo-splash-screen')
}

module.exports = ({ config }) => ({
  ...config,
  ...baseConfig.expo,
  extra: {
    ...baseConfig.expo.extra,
  },
  ios: {
    ...baseConfig.expo.ios,
    config: {
      ...baseConfig.expo.ios?.config,
      googleMapsApiKey: iosMapsKey,
    },
  },
  android: {
    ...baseConfig.expo.android,
    config: {
      ...baseConfig.expo.android?.config,
      googleMaps: {
        ...baseConfig.expo.android?.config?.googleMaps,
        apiKey: androidMapsKey,
      },
    },
  },
  plugins,
})
