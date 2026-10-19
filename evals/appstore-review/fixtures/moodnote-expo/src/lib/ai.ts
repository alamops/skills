// "Reflections": after each journal entry we ask GPT for a short supportive reflection.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function getReflection(entry: { text: string; mood: number }, user: { displayName: string; email: string }) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.EXPO_PUBLIC_OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: `You are a warm journaling coach. The user is ${user.displayName} (${user.email}).` },
        { role: 'user', content: `Mood ${entry.mood}/5. Entry: ${entry.text}` },
      ],
    }),
  });
  const json = await res.json();
  return json.choices[0].message.content as string;
}
