import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function createAccount() {
    await auth().createUserWithEmailAndPassword(email, password);
  }

  async function continueWithGoogle() {
    const { data } = await GoogleSignin.signIn();
    const credential = auth.GoogleAuthProvider.credential(data?.idToken ?? null);
    await auth().signInWithCredential(credential);
  }

  return (
    <View style={{ padding: 24, width: 390 }}>
      <Text style={{ fontSize: 28 }}>Create your MoodNote account</Text>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Button title="Create account" onPress={createAccount} />
      <Button title="Continue with Google" onPress={continueWithGoogle} />
    </View>
  );
}
