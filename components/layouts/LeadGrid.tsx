import { Container, Grid, SimpleGrid, Skeleton } from "@mantine/core";
import React, { PropsWithChildren } from "react";

type LeadGridProps = PropsWithChildren<{
  content?: React.ReactNode;
  footer?: React.ReactNode;
}>;

const PRIMARY_COL_HEIGHT = "80vh";

export const LeadGrid: React.FC<LeadGridProps> = ({ content, footer }) => {
  const SECONDARY_COL_HEIGHT = `calc(${PRIMARY_COL_HEIGHT} / 2 - var(--mantine-spacing-md) / 2)`;

  return (
    <Container my="md" size="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <div
          style={{ height: PRIMARY_COL_HEIGHT, overflowY: "scroll" }}
          className="px-6"
        >
          {content}
        </div>
        <Grid gutter="md">
          <Grid.Col>
            <div style={{ height: SECONDARY_COL_HEIGHT }}>{footer}</div>
          </Grid.Col>
        </Grid>
      </SimpleGrid>
    </Container>
  );
};
