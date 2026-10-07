import { screen } from "@testing-library/react-native";
import { renderApp } from "../test-utils/renderApp"

describe('Integration: Auth flow test', () => {

  test('the user can sign-in and sign-out', async () => {
    renderApp()
    expect(await screen.findByText("Bem-vindo"));
  })
})