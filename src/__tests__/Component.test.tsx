import { useState } from "react";
import { Text, View, Pressable } from "react-native";

function Component({ label, loading }: { label: string; loading: boolean }) {
  const [count, setCount] = useState(0);

  if (loading) {
    return <Text>Is loading....</Text>;
  }

  return (
    <View>
      <Pressable
        testID="label-button"
        onPress={() => setCount((prev) => prev + 1)}
      >
        <Text>{label}</Text>
      </Pressable>
      <Text>Pressed:{count}</Text>
      <Text onPress={() => setCount(0)}>reset count</Text>
    </View>
  );
}