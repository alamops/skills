import React from 'react';
import { View, Button, Linking, Text } from 'react-native';
import auth from '@react-native-firebase/auth';
import { useStripe } from '@stripe/stripe-react-native';
import { rewardsWallEnabled } from '../lib/flags';
import { trackEvent } from '../lib/analytics';

export default function Settings({ navigation }: any) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // MoodNote Pro: unlimited AI reflections + mood insights. $4.99/month.
  async function upgradeToPro() {
    const r = await fetch('https://api.moodnote.app/stripe/subscription-sheet', { method: 'POST' });
    const { paymentIntent, ephemeralKey, customer } = await r.json();
    await initPaymentSheet({ merchantDisplayName: 'MoodNote', paymentIntentClientSecret: paymentIntent, customerEphemeralKeySecret: ephemeralKey, customerId: customer });
    const { error } = await presentPaymentSheet();
    if (!error) trackEvent('pro_subscribed');
  }

  return (
    <View>
      <Text>Account</Text>
      <Button title="Upgrade to MoodNote Pro" onPress={upgradeToPro} />
      <Button title="Manage billing on the web" onPress={() => Linking.openURL('https://moodnote.app/billing')} />
      {rewardsWallEnabled() && <Button title="Earn gift cards" onPress={() => navigation.navigate('Rewards')} />}
      <Button title="Log out" onPress={() => auth().signOut()} />
    </View>
  );
}
