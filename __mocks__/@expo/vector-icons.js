const React = require('react');
const { Text } = require('react-native');

const createIconSet = () => {
  const Icon = ({ name, size, color, style }) =>
    React.createElement(Text, { style: [{ fontSize: size, color }, style] }, name);
  return Icon;
};

module.exports = {
  Ionicons: createIconSet(),
  MaterialIcons: createIconSet(),
  FontAwesome: createIconSet(),
  AntDesign: createIconSet(),
  Feather: createIconSet(),
};
