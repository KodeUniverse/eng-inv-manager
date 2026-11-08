import { useState } from "react";
import {
  Button,
  Container,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import ScrapView from "./views/ScrapView";

const VIEWS = [
  { label: "Scrap", value: "scrap" },
  { label: "Repair economics", value: "repair" },
  { label: "Inventory & sell-through", value: "inventory" },
  { label: "Decision support", value: "decision" },
];

function App() {
  const [view, setView] = useState("scrap");
  const { toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("dark");

  return (
    <Container size="xl" py="md">
      <Stack>
        <Group justify="space-between" wrap="wrap">
          <Title order={2}>Parts Inventory</Title>
          <Group>
            <SegmentedControl value={view} onChange={setView} data={VIEWS} />
            <Button variant="default" onClick={toggleColorScheme}>
              {colorScheme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </Group>
        </Group>
        {view === "scrap" ? (
          <ScrapView />
        ) : (
          <Text c="dimmed">This view isn't built yet.</Text>
        )}
      </Stack>
    </Container>
  );
}

export default App;
