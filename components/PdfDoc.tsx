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
const logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgNTAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiIGZpbGw9IiMxZTdkYmYiLz48dGV4dCB4PSIxMTAiIHk9IjMwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiNmZmYiPk5vdGVEb2N0b3I8L3RleHQ+PC9zdmc+';
const styles = StyleSheet.create({
  document: {
    // document-level styles
  },
  page: {
    flexDirection: "column",
    padding: 30,
  },
  header: {
    marginBottom: 20,
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
    marginBottom: 5,
  },
  heading2: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 4,
  },
  heading3: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
    marginBottom: 3,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  listItemBullet: {
    width: 20,
    fontSize: 10,
  },
  listItemContent: {
    flex: 1,
    fontSize: 10,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  logo: {
    width: 50,
    height: 50,
    marginRight: 10,
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chat Transcript</Text>
          {/* <Text style={styles.subtitle}>
          Generated for {name} ({role})
        </Text> */}
        </View>

        {/* Messages */}
        {messages.map((message, index) => (
          <View key={index} style={styles.messageContainer}>
            <Text style={[
              styles.messageHeader,
              message.role === 'user' ? styles.userMessage : styles.aiMessage
            ]}>
              {message.role === 'user' ? 'You:' : 'AI:'}
            </Text>
            <View style={styles.messageContent}>
              {message.content.split('\n').map((line, i) => {
                // Handle markdown headers and lists
                if (line.startsWith('## ')) {
                  return <Text key={i} style={styles.heading2}>{line.replace('## ', '')}</Text>;
                } else if (line.startsWith('### ')) {
                  return <Text key={i} style={styles.heading3}>{line.replace('### ', '')}</Text>;
                } else if (line.startsWith('# ')) {
                  return <Text key={i} style={styles.heading1}>{line.replace('# ', '')}</Text>;
                } else if (line.startsWith('- ')) {
                  return (
                    <View key={i} style={styles.listItem}>
                      <Text style={styles.listItemBullet}>•</Text>
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
                  return <Text key={i} style={{height: 8}}> </Text>;
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
