import { Button, Group, Text } from "@mantine/core";
import { IconUpload, IconPhoto, IconX } from "@tabler/icons-react";
import {
  Dropzone,
  DropzoneProps,
  IMAGE_MIME_TYPE,
  MIME_TYPES,
} from "@mantine/dropzone";
import { useRef } from "react";

export function FileUploadForm(props: Partial<DropzoneProps>) {
  const openRef = useRef<() => void>(null);

  return (
    <Dropzone
      onDrop={(files) => console.log("accepted files", files)}
      onReject={(files) => console.log("rejected files", files)}
      maxSize={5 * 1024 ** 2}
      accept={[MIME_TYPES.png, MIME_TYPES.jpeg]}
      className="mb-5 bg-white "
      {...props}
    >
      <Group
        justify="center"
        gap="l"
        mih={100}
        style={{ pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <IconUpload
            size={42}
            color="var(--mantine-color-blue-6)"
            stroke={1.5}
          />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={42} color="var(--mantine-color-red-6)" stroke={1.5} />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconPhoto
            size={42}
            color="var(--mantine-color-dimmed)"
            stroke={1.5}
          />
        </Dropzone.Idle>

        <div>
          <Text size="l" inline>
            Drag images here or click to select files
          </Text>
          <Text size="xs" c="dimmed" inline mt={7}>
            Attach as many files as you like, each file should not exceed 5mb
          </Text>
        </div>
      </Group>
      <Group justify="center" mt="xs" pb="xl">
        <Button onClick={() => openRef.current?.()}>Select files</Button>
      </Group>
    </Dropzone>
  );
}
