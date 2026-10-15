import { Component } from 'react';

/** Isola um pedaço da tela: se ele falhar ao desenhar, some sozinho e o resto da página segue funcionando. */
export class Isolated extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // sem barulho: o cartão simplesmente não aparece
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
