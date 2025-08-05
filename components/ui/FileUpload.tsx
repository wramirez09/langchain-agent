import { Button, Group, SimpleGrid, Text, Image } from "@mantine/core";
import { IconUpload, IconPhoto, IconX } from "@tabler/icons-react";
import {
  Dropzone,
  DropzoneProps,
  FileWithPath,
  MIME_TYPES,
} from "@mantine/dropzone";
import { useRef, useState } from "react";
import React from "react";
import { toast } from "react-toastify";

const fileUploadEndPoint = "/api/retrieval/ingest";

export function FileUploadForm({
  onUpload,
}: {
  onUpload: (file: File) => Promise<void>;
}) {
  const openRef = useRef<() => void>(null);
  const [files, setFiles] = useState<FileWithPath[]>([]);

  const previews = React.useCallback(
    () =>
      files.map((file, index) => {
        const imageUrl = URL.createObjectURL(file);
        return (
          <Image
            key={index}
            src={imageUrl}
            onLoad={() => URL.revokeObjectURL(imageUrl)}
          />
        );
      }),
    [setFiles, files],
  );

  // const handleFileUpload = async (fileToUpload: any) => {
  //   const formData = new FormData();
  //   formData.append("file", fileToUpload);

  //   try {
  //     // Send the file to the API endpoint
  //     const response = await fetch(fileUploadEndPoint, {
  //       method: "POST",
  //       body: formData,
  //     });

  //     if (!response.ok) {
  //       throw new Error(`Upload failed with status: ${response.status}`);
  //     }

  //     const result = await response.json();
  //     console.log(`File "${fileToUpload.name}" uploaded successfully:`, result);
  //     toast(`"${fileToUpload.name}" uploaded successfully!`);
  //   } catch (error) {
  //     console.error(
  //       `Error during file upload for "${fileToUpload.name}":`,
  //       error,
  //     );
  //     toast(`Failed to upload "${fileToUpload.name}". Please try again.`);
  //   } finally {
  //   }
  // };

  return (
    <>
      <Dropzone
        onDrop={(file) => {
          setFiles(file);
          onUpload(file[0]);
        }}
        onReject={(files) => console.log("rejected files", files)}
        maxSize={15 * 1024 ** 2}
        accept={[MIME_TYPES.pdf]}
        className="mb-5 bg-white"
        multiple={false}
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
      <SimpleGrid cols={{ base: 1, sm: 4 }} mt={previews.length > 0 ? "xl" : 0}>
        {previews()}
      </SimpleGrid>
    </>
  );
}
