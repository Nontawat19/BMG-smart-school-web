import { StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
    page: {
        fontFamily: 'TH Sarabun PSK',
        paddingTop: 30,
        paddingRight: 42,
        paddingBottom: 20,
        paddingLeft: 42,
        fontSize: 14,
        color: '#000',
    },

    header: {
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 2,
    },
    subHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 10,
        marginBottom: 5,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 0,
        flexWrap: 'wrap',
    },
    rowNoWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 1.5,
    },
    label: {
        fontWeight: 'bold',
    },
    text: {
        fontSize: 14,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 10,
    },
    checkbox: {
        width: 10,
        height: 10,
        borderWidth: 0.8,
        borderColor: '#000',
        marginLeft: 5,
        marginRight: 5,
        marginTop: 3, // Moved up 1px as requested
        justifyContent: 'center',
        alignItems: 'center',
    },
    checked: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkMark: {
        fontFamily: 'TH Sarabun PSK',
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: -3,
    },
    dottedLine: {
        borderBottomWidth: 0.5,
        borderBottomColor: '#000',
        borderBottomStyle: 'dashed',
        flexGrow: 1,
        minWidth: 20,
        marginLeft: 2,
    },
    centeredDottedLine: {
        borderBottomWidth: 0.5,
        borderBottomColor: '#000',
        borderBottomStyle: 'dashed',
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        paddingBottom: 0,
        marginLeft: 2,
        marginRight: 2,
        minHeight: 16,
    },
    centeredTextOnLine: {
        fontFamily: 'TH Sarabun PSK',
        textAlign: 'center',
        width: '100%',
        fontSize: 14,
        paddingBottom: 0,
    },

    table: {
        width: '100%',
        borderWidth: 0.5,
        borderColor: '#000',
        marginTop: 5,
        marginBottom: 5,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#000',
    },
    tableCell: {
        padding: 2,
        fontSize: 12,
        textAlign: 'center',
        borderRightWidth: 0.5,
        borderRightColor: '#000',
    },
    tableHeaderCell: {
        backgroundColor: '#f0f0f0',
        padding: 2,
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center',
        borderRightWidth: 0.5,
        borderRightColor: '#000',
    },
    lastCell: {
        borderRightWidth: 0,
    },
    pageNumber: {
        position: 'absolute',
        top: 15,
        right: 0,
        left: 0,
        textAlign: 'center',
        fontSize: 11,
    },
    imageContainer: {
        width: '48%',
        marginBottom: 10,
        borderWidth: 0.5,
        borderColor: '#000',
    },
    photo: {
        width: '100%',
        height: 150,
        objectFit: 'cover',
    },
    photoPlaceholder: {
        width: '100%',
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    photoLabel: {
        fontSize: 10,
        textAlign: 'center',
        marginTop: 3,
    },
    signatureContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 20,
    },
    signatureBox: {
        width: '40%',
        textAlign: 'center',
    },
    studentPhoto: {
        width: 65,
        height: 85,
        borderWidth: 1,
        borderColor: '#000',
        position: 'absolute',
        top: -10,
        right: 0,
        objectFit: 'contain',
    }
});

