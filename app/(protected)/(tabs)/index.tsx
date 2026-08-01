import { Box } from "@/src/components/Box";
import { Text } from "@/src/components/Text";
import { useAppTheme } from "@/src/theme/useAppTheme";


export default function HomeScreen() {
  const { } = useAppTheme()
  return (
    <Box>
      <Text>Home Screen</Text>
    </Box>
  );
}
