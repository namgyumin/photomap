import { useEffect, useRef } from 'react'
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads'

const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-1579879380097498/3431344667'

export function useInterstitialAd() {
  const adRef = useRef<InterstitialAd | null>(null)
  const loadedRef = useRef(false)

  const load = () => {
    const ad = InterstitialAd.createForAdRequest(AD_UNIT_ID, { requestNonPersonalizedAdsOnly: false })
    ad.addAdEventListener(AdEventType.LOADED, () => { loadedRef.current = true })
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      loadedRef.current = false
      load()
    })
    ad.load()
    adRef.current = ad
  }

  useEffect(() => {
    load()
  }, [])

  const show = () => {
    if (adRef.current && loadedRef.current && Math.random() < 0.3) {
      adRef.current.show()
    }
  }

  return { show }
}
