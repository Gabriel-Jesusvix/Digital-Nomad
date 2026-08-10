import { Screen } from "@/src/components/Screen";
import { Text } from "@/src/components/Text";
import { CityDetailsHeader } from "@/src/containers/CityDetailsHeader";
import { useCityDetails } from "@/src/data/useCityDetails";
import { useLocalSearchParams } from "expo-router";

export default function CityDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const city = useCityDetails(id)

  if (!city) {
    return (
      <Screen flex={1} justifyContent="center" alignItems="center">
        <Text>City not found</Text>
      </Screen>
    )
  }

  return (
    <Screen
      style={{ paddingHorizontal: 0 }}
    >
      <CityDetailsHeader
        categories={city.categories}
        coverImage={city.coverImage}
        id={city.id}
      />
    </Screen>
  );
}
