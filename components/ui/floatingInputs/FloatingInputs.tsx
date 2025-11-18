"use client";

type PickedFloatingLabelProps<T> = {
  render: () => React.ReactNode;
};

export function FloatinglInputBase<T>(
  props: React.PropsWithChildren<PickedFloatingLabelProps<T>>,
) {
  return <>{props.render()}</>;
}
