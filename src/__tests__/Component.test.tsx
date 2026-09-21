import { useState } from "react";
import { Text, View, Pressable } from "react-native";
import {
  fireEvent,
  render,
  screen,
  userEvent,
} from "@testing-library/react-native";

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

describe('Component', () => {
  test("should display the label when is not loading", () => {
    render(<Component label="hello world" loading={false} />);

    const element = screen.getByText('hello world');

    expect(element).toBeOnTheScreen();
  })
  it("should display the loading message when is loading", () => {
    render(<Component label="hello world" loading={true} />);

    // const element = screen.getByText(/Is loading..../i);

    // expect(element).toBeOnTheScreen();
    expect(screen.getByText(/Is loading..../i)).toBeOnTheScreen();
  })
})
