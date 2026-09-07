import { useAuthSignIn } from "@/src/domain/Auth/operations/useAuthSignIn";
import { Button } from "@/src/ui/components/Button";
import { Screen } from "@/src/ui/components/Screen";
import { Text } from "@/src/ui/components/Text";
import { TextInput } from "@/src/ui/components/TextInput";
import { useState } from "react";
import { Image, StyleSheet } from "react-native";
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
        <Image
          source={require("../assets/images/logo.png")}
          style={{
            width: 150,
            height: 60,
            alignSelf: "center",
            marginTop: 20,
            marginBottom: 60,
          }}
        />
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
        <Text mb="s16" alignSelf="flex-end" variant="text14" color="primary">
          Esqueceu sua senha
        </Text>
        <Button title="Entrar" onPress={handleSignIn} />
        <Text alignSelf="center" mt="s16" color="gray2">
          Ainda não tem uma conta?{" "}
          <Text variant="title14" color="primary">
            Criar
          </Text>
        </Text>
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