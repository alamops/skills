import React, { useState } from 'react';
import { View, TextInput, Button, Text, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import { getReflection } from '../lib/ai';

const { width } = Dimensions.get('window'); // computed once at module load

export default function Journal() {
  const [text, setText] = useState('');
  const [mood, setMood] = useState(3);
  const [reflection, setReflection] = useState<string | null>(null);

  async function save() {
    await AsyncStorage.setItem(`entry:${Date.now()}`, JSON.stringify({ text, mood }));
    const u = auth().currentUser!;
    setReflection(await getReflection({ text, mood }, { displayName: u.displayName ?? '', email: u.email ?? '' }));
  }

  return (
    <View style={{ width, padding: 16 }}>
      <TextInput multiline placeholder="How are you feeling today?" value={text} onChangeText={setText} />
      <Button title="Save & reflect" onPress={save} />
      {reflection && <Text>{reflection}</Text>}
    </View>
  );
}
