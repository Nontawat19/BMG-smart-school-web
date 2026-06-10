import React from "react";
import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CheckMarkSymbol } from "./Checkbox";
import { HOME_VISIT_A4 } from "./HomeVisitPdfStyles";

const TEMPLATE_WIDTH = 1241;
const TEMPLATE_HEIGHT = 1755;
const X_SCALE = HOME_VISIT_A4.width / TEMPLATE_WIDTH;
const Y_SCALE = HOME_VISIT_A4.height / TEMPLATE_HEIGHT;

const styles = StyleSheet.create({
    page: {
        padding: 0,
        margin: 0,
        fontFamily: "TH Sarabun PSK",
        color: "#000",
    },
    canvas: {
        position: "relative",
        width: HOME_VISIT_A4.width,
        height: HOME_VISIT_A4.height,
        overflow: "hidden",
    },
    template: {
        position: "absolute",
        left: 0,
        top: 0,
        width: HOME_VISIT_A4.width,
        height: HOME_VISIT_A4.height,
    },
    text: {
        position: "absolute",
        fontSize: 10,
        lineHeight: 1,
        textAlign: "center",
    },
    mark: {
        position: "absolute",
        width: 10,
        height: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    photo: {
        position: "absolute",
        objectFit: "contain",
    },
});

const x = (value: number) => value * X_SCALE;
const y = (value: number) => value * Y_SCALE;

export const TemplatePage = ({ src, children }: { src: string; children?: React.ReactNode }) => (
    <Page size="A4" wrap={false} style={styles.page}>
        <View style={styles.canvas}>
            <Image src={src} style={styles.template} />
            {children}
        </View>
    </Page>
);

export const TemplateText = ({
    value,
    left,
    top,
    width,
    size = 10,
    align = "center",
    bold = false,
    lineHeight = 1,
}: {
    value?: unknown;
    left: number;
    top: number;
    width: number;
    size?: number;
    align?: "left" | "center" | "right";
    bold?: boolean;
    lineHeight?: number;
}) => {
    const text = value == null ? "" : String(value);
    if (!text) return null;

    return <Text style={[styles.text, { left: x(left), top: y(top), width: x(width), fontSize: size, textAlign: align, fontWeight: bold ? "bold" : "normal", lineHeight }]}>{text}</Text>;
};

export const TemplateMark = ({ checked, left, top }: { checked?: boolean; left: number; top: number }) => {
    if (!checked) return null;

    return (
        <View style={[styles.mark, { left: x(left), top: y(top) }]}>
            <CheckMarkSymbol />
        </View>
    );
};

export const TemplatePhoto = ({
    src,
    left,
    top,
    width,
    height,
}: {
    src?: string;
    left: number;
    top: number;
    width: number;
    height: number;
}) => {
    if (!src) return null;

    return <Image src={src} style={[styles.photo, { left: x(left), top: y(top), width: x(width), height: y(height) }]} />;
};
