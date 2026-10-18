/**
 * components/PasswordInput.tsx
 *
 * Passwortfeld mit Augen-Symbol zum Ein-/Ausblenden des Passworts
 * (Login, Registrierung, Passwort zurücksetzen). Nimmt dieselben Props wie
 * TextInput; `style` ist der Stil des Eingabefelds.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';

import { useTranslation } from '@/lib/i18n';

export function PasswordInput({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
      >
        <MaterialIcons name={visible ? 'visibility-off' : 'visibility'} size={20} color="#888" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  // Platz rechts für das Augen-Symbol
  input: { paddingRight: 46 },
  toggle: { position: 'absolute', right: 14 },
});
