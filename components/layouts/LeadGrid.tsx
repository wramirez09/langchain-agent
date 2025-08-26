import React, { PropsWithChildren } from "react";
import { ToastContainer } from "react-toastify";
type LeadGridProps = PropsWithChildren<{
  content?: React.ReactNode;
  form?: React.ReactNode;
}>;

const PRIMARY_COL_HEIGHT = "85vh";

export const LeadGrid: React.FC<LeadGridProps> = ({ content, form }) => {
  const SECONDARY_COL_HEIGHT = `calc(${PRIMARY_COL_HEIGHT} / 2 - var(--mantine-spacing-md) / 2)`;

  return <div className="px-1 md:px-6">{content}</div>;
};
