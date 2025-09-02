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
import logo from "@/public/images/logo-main.svg";
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
    marginBottom: 5,
    break: "auto", // allow this section to flow across pages
  },
  messageText: {
    fontSize: 10,
    lineHeight: 1.2,
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
          <Image src={logo} style={styles.logo} cache fixed />
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
            <Text style={styles.messageText}>{message.content}</Text>
          </View>
        ))}
      </Page>
    </Document>
  </PDFViewer>
);

export default PdfDoc;
