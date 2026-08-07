import { Screen } from "@/src/components/Screen";
import { CityDetailsHeader } from "@/src/containers/CityDetailsHeader";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function CityDetails() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();

  return (
    <Screen>
      <CityDetailsHeader
        cityName={name}
      />
    </Screen>
  );
}
