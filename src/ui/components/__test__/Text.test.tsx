import { screen } from "@testing-library/react-native"
import { Text } from "../Text"
import { renderComponent } from "@/src/test-utils/renderComponent"


describe('<Text/>', () => {
  it("Render component Text", () => {
    renderComponent(<Text>Hello world</Text>)

    expect(screen.getByText('Hello world')).toBeOnTheScreen();
  })

})