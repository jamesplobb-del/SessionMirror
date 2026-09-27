import { Capacitor } from '@capacitor/core'
import { plusBridge } from '../plus/plusAccess'


/** Apple validates the code. Never grant access merely because this resolves. */
export async function redeemOfferCode(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') {
    throw new Error('Open BestTake on your iPhone or iPad to redeem a code.')
  }
  if (!Capacitor.isPluginAvailable('OfferCodes')) {
    throw new Error('Update BestTake to redeem a code, then try again.')
  }
  await plusBridge.redeem()
}
