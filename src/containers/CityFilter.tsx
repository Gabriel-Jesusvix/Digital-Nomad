import { ScrollView } from "react-native";
import { Box } from "../components/Box";
import { CategoryPill } from "../components/CategoryPill";
import { SearchInput } from "../components/SearchInput";
import { Category } from "../types";

type CityFilterProps = {
  categories?: Category[]
  cityName: string;
  onChangeCityName: (name: string) => void;
  selectedCategoryId: string | null;
  onChangeSelectedCategoryId: (categoryId: string | null) => void;
}
export function CityFilter({ categories, cityName, onChangeCityName, selectedCategoryId, onChangeSelectedCategoryId }: CityFilterProps) {
  return (
    <Box>
      <Box paddingHorizontal="padding">
        <SearchInput value={cityName} onChangeText={onChangeCityName} />
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <Box
          flexDirection="row"
          mt="s16"
          gap="s8"
          paddingHorizontal="padding"
        >
          {
            categories?.map((category) => (
              <CategoryPill
                key={category.id}
                active={category.id === selectedCategoryId}
                category={category}
                onPress={() => onChangeSelectedCategoryId(
                  category.id === selectedCategoryId ? null : category.id
                )}
              />
            ))
          }
        </Box>
      </ScrollView>
    </Box>
  )
}