"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  PDFViewer,
} from "@react-pdf/renderer";
import { type Message } from "ai";

// Base64 encoded logo as a data URL
const logoBase64 = 'data:image/png;base64,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';
const styles = StyleSheet.create({
  document: {
    // document-level styles
  },
  page: {
    flexDirection: "column",
    padding: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 10,
    color: "#555",
  },
  messageContainer: {
    marginBottom: 10,
    break: "auto",
  },
  messageHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  userMessage: {
    color: '#1e7dbf',
  },
  aiMessage: {
    color: '#333',
  },
  messageContent: {
    fontSize: 10,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  heading1: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 10,
  },
  heading3: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
    marginBottom: 10,
  },
  heading4: {
    fontSize: 11,
    fontFamily: 'Helvetica',
    marginTop: 6,
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,

  },
  listItemBullet: {
    width: 20,
    fontSize: 11,
    fontWeight: 'bold',
    color: "#1e7dbf"
  },
  listItemContent: {
    flex: 1,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1e7dbf'
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  logo: {
    width: '25', // Adjust width as needed
    height: 'auto', // Maintain aspect ratio
    alignSelf: 'center'
  },
});

type PdfProps = {
  name: string;
  role: string;
  messages: Message[];
};

const PdfDoc: React.FC<PdfProps> = ({ name, role, messages }) => (
  <PDFViewer width="100%" height="100%">
    <Document>
      <Page style={styles.page}>
        <View style={styles.header}>
          <Image src={logoBase64} style={styles.logo} cache={false} />
          <View>
            <Text style={styles.companyName}>NoteDoctor.Ai</Text>
            {/* <Text style={styles.subtitle}>
            Chat generated for {name} ({role})
          </Text> */}
          </View>
        </View>


        {/* Messages */}
        {messages.map((message, index) => (
          <View key={index} style={styles.messageContainer}>

            <View style={styles.messageContent}>
              {message.content.split('\n').map((line, i) => {
                const specialHeaders = [
                  'Medical Necessity Criteria:',
                  'Relevant Codes:',
                  'Required Documentation:',
                  'Limitations/Exclusions:'
                ];
                const isSpecialHeader = specialHeaders.some(header => line.trim() === header);

                // Handle markdown headers and lists
                if (isSpecialHeader) {
                  return <Text key={i} style={[styles.heading4, { color: 'red' }]}>{line}</Text>;
                } else if (line.startsWith('## ')) {
                  return <Text key={i} style={styles.heading2}>{line.replace('## ', '')}</Text>;
                } else if (line.startsWith('### ')) {
                  return <Text key={i} style={styles.heading3}>{line.replace('### ', '')}</Text>;
                } else if (line.startsWith('# ')) {
                  return <Text key={i} style={styles.heading1}>{line.replace('# ', '')}</Text>;
                } else if (line.startsWith('- ') || line.startsWith('* ')) {
                  return (
                    <View key={i} style={styles.listItem}>
                      <Text style={styles.listItemContent}>{line.replace('- ', '')}</Text>
                    </View>
                  );

                } else if (line.match(/^\d+\.\s/)) {
                  // Handle numbered lists
                  const [num, ...rest] = line.split('. ');
                  return (
                    <View key={i} style={styles.listItem}>
                      <Text style={styles.listItemBullet}>{num}.</Text>
                      <Text style={styles.listItemContent}>{rest.join('. ')}</Text>
                    </View>
                  );
                } else if (line.trim() === '') {
                  // Add some space between paragraphs
                  return <Text key={i} style={{ height: 8 }}> </Text>;
                } else {
                  // Regular text
                  return <Text key={i} style={styles.messageContent}>{line}</Text>;
                }
              })}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  </PDFViewer>
);

export default PdfDoc;
