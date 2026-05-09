import { View, Text, Svg, Path } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';

interface CheckboxProps {
    checked: boolean;
    label: string;
}

export const CheckMarkSymbol = () => (
    <Svg viewBox="0 0 10 10" style={{ width: 8, height: 8 }}>
        <Path
            d="M2 5L4 7L8 3"
            stroke="black"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const Checkbox: React.FC<CheckboxProps> = ({ checked, label }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 0 }}>
        <View style={styles.checkbox}>
            {checked && <CheckMarkSymbol />}
        </View>
        <Text style={styles.text}>{label}</Text>
    </View>
);

export default Checkbox;
