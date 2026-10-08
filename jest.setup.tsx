/* eslint-disable @typescript-eslint/no-require-imports */
// Reanimated 4 / Worklets: não há módulo nativo no Jest
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
);

require('react-native-reanimated').setUpTests();

// react-native-maps: TurboModule nativo não existe no Jest
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
    }));
    return React.createElement(View, props, props.children);
  });

  const Marker = (props: any) => React.createElement(View, props, props.children);

  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: undefined,
  };
});

jest.mock("@expo/vector-icons/createIconSetFromIcoMoon", () => {

  const { View } = require("react-native");
  function FakeIcon(props: any) {
    return <View testID={`icon-${props.name}`} />;
  }

  return () => FakeIcon;
});