import { renderComponent } from "@/src/test-utils/renderComponent"
import { SignUpForm } from "../SignUpForm"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"

describe('<SignUpForm />', () => {
  it('should submit the form when all fields are filled in correctly', async () => {
    const onSubmitMock = jest.fn()
    renderComponent(<SignUpForm onSubmit={onSubmitMock} />)

    fireEvent.changeText(screen.getByTestId('fullname-input'), "Gabriel Jesus")
    fireEvent.changeText(screen.getByTestId('email-input'), "gabriel.jesus@example.com")
    fireEvent.changeText(screen.getByTestId('password-input'), "password123")
    fireEvent.changeText(screen.getByTestId('confirm-password-input'), "password123")

    fireEvent.press(screen.getByTestId('submit-button'))

    await waitFor(() => {
      expect(onSubmitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fullname: "Gabriel Jesus",
          email: "gabriel.jesus@example.com",
          password: "password123",
        }),
        undefined // React Hook Form onInvalid callback
      );
    });
  })
})