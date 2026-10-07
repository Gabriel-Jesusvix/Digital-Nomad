import { renderComponent } from "@/src/test-utils/renderComponent"
import { SignUpForm } from "../SignUpForm"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import theme from "@/src/ui/theme/theme"

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
  describe("should NOT submit form", () => {
    it("when the password and confirm password do not match", async () => {
      const onSubmitMock = jest.fn();
      renderComponent(<SignUpForm onSubmit={onSubmitMock} />);

      fireEvent.changeText(
        screen.getByTestId("fullname-input"),
        "Lucas Garcez"
      );

      fireEvent.changeText(
        screen.getByTestId("email-input"),
        "lucas@coffstack.com"
      );

      fireEvent.changeText(screen.getByTestId("password-input"), "12345678");
      fireEvent.changeText(
        screen.getByTestId("confirm-password-input"),
        "another-password"
      );

      fireEvent.press(screen.getByTestId("submit-button"));

      expect(await screen.findByText("senhas devem ser iguais"));

      //style test
      expect(
        screen.getByTestId("confirm-password-input-container")
      ).toHaveStyle({ borderColor: theme.colors.fbErrorSurface });

      expect(onSubmitMock).not.toHaveBeenCalled();
    });

    it("when the email is invalid", async () => {
      const onSubmitMock = jest.fn();
      renderComponent(<SignUpForm onSubmit={onSubmitMock} />);

      fireEvent.changeText(
        screen.getByTestId("fullname-input"),
        "Lucas Garcez"
      );

      fireEvent.changeText(screen.getByTestId("email-input"), "invalid-email");

      fireEvent.changeText(screen.getByTestId("password-input"), "12345678");
      fireEvent.changeText(
        screen.getByTestId("confirm-password-input"),
        "12345678"
      );

      fireEvent.press(screen.getByTestId("submit-button"));

      expect(await screen.findByText("email inválido"));

      expect(onSubmitMock).not.toHaveBeenCalled();
    });
  });
})
