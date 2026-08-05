import { useState } from "react";
import { Box } from "../components/Box";
import { SearchInput } from "../components/SearchInput";


export function CityFilter() {
  const [value, onChangeText] = useState("");
  return (
    <Box>
      <SearchInput value={value} onChangeText={onChangeText} />
    </Box>
  )
}