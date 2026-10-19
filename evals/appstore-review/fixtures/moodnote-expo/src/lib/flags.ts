import remoteConfig from '@react-native-firebase/remote-config';

export async function loadFlags() {
  await remoteConfig().setDefaults({ rewards_wall: false });
  await remoteConfig().fetchAndActivate();
}

// Keep false while a build is in App Review — flip it on in the Firebase console once approved.
// Rewards wall pays users in gift cards for watching partner offers.
export function rewardsWallEnabled() {
  return remoteConfig().getValue('rewards_wall').asBoolean();
}
