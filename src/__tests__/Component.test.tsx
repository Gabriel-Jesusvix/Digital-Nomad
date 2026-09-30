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
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });
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
  it("should display the correct count number", () => {
    render(<Component label="hello world" loading={false} />);
    expect(screen.getByText(/Pressed:0/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('label-button'))
    expect(screen.getByText(/Pressed:1/)).toBeOnTheScreen();
  })

  it("should display reset the count when press the reset text 2", async () => {
    render(<Component label="Hello World" loading={false} />);

    expect(screen.getByText(/Pressed:0/i)).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));

    expect(screen.getByText(/Pressed:4/i)).toBeOnTheScreen();
  });
})
