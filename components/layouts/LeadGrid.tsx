import { Container, Grid, SimpleGrid } from "@mantine/core";
import React, { PropsWithChildren } from "react";
import { ToastContainer } from "react-toastify";
type LeadGridProps = PropsWithChildren<{
  content?: React.ReactNode;
  footer?: React.ReactNode;
}>;

const PRIMARY_COL_HEIGHT = "85vh";

export const LeadGrid: React.FC<LeadGridProps> = ({ content, footer }) => {
  const SECONDARY_COL_HEIGHT = `calc(${PRIMARY_COL_HEIGHT} / 2 - var(--mantine-spacing-md) / 2)`;

  return (
    <Container my="md" size="xl" fluid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className="h-[100vh]">
        <Grid>
          <Grid.Col className="h-[100vh]" style={{ overflowY: "scroll" }}>
            <div className="px-1 md:px-6">{content}</div>
          </Grid.Col>
        </Grid>
        <Grid gutter="md" className="h-[84vh]">
          {/* forms */}
          <Grid.Col className="flex flex-col justify-end md:justify-center align-items-center h-[84vh]">
            {footer}
          </Grid.Col>
        </Grid>
      </SimpleGrid>
    </Container>
  );
};
