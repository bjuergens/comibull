import { notifications } from '@mantine/notifications';

export function showError(title: string, message: string) {
  notifications.show({ color: 'red', title, message, autoClose: 8000 });
}

export function showSuccess(title: string, message: string) {
  notifications.show({ color: 'teal', title, message, autoClose: 5000 });
}

export function showCatastrophic(message: string) {
  notifications.show({
    color: 'red',
    title: '💥 Etwas ist schiefgelaufen',
    message,
    autoClose: false,
  });
}
