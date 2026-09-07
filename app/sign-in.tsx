import { useAuthSignIn } from "@/src/domain/Auth/operations/useAuthSignIn";
import { Button } from "@/src/ui/components/Button";
import { Screen } from "@/src/ui/components/Screen";
import { Text } from "@/src/ui/components/Text";
import { TextInput } from "@/src/ui/components/TextInput";
import { Logo } from "@/src/ui/containers/Logo";
import { TextLink } from "@/src/ui/containers/TextLink";
import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignInScreen() {
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
        <Logo />
        <Text variant="title22" alignSelf="center" mb="s16">
          Bem-vindo
        </Text>
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
          // errorMessage="mensagem de erro"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="digite sua senha"
        />
        <Link href="/reset-password" asChild>
          <Text mb="s16" alignSelf="flex-end" variant="text14" color="primary">
            Esqueceu sua senha
          </Text>
        </Link>
        <Button title="Entrar" onPress={handleSignIn} />
        <TextLink
          href="/sign-up"
          text="Ainda não tem uma conta?"
          ctaText="Criar"
        />
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