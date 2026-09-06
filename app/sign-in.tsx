import { useAuthSignIn } from "@/src/domain/Auth/operations/useAuthSignIn";
import { Screen } from "@/src/ui/components/Screen";
import { TextInput } from "@/src/ui/components/TextInput";
import { useState } from "react";
import { Button, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignInScreen() {
  // Tela simples para apenas simular Sign-In
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { mutate: signIng } = useAuthSignIn();

  function handleSignIn() {
    console.log({ email, password });
    signIng({ email, password });
  }
  return (
    <Screen>
      <SafeAreaView>
        <TextInput
          label="E-mail"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="seu email"
          autoCapitalize="none"
        />
        <TextInput
          label="Senha"
          errorMessage="mensagem de erro"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="digite sua senha"
        />
        <Button title="Entrar" onPress={handleSignIn} />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderColor: "#fff",
    borderWidth: 1,
    height: 60,
    color: "#fff",
    fontSize: 20,
    marginVertical: 16,
  },
});