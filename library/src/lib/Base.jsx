"use client";

import React from 'react';
import { string, object, number, bool, func, oneOfType, oneOf, shape, element } from 'prop-types';

import { namespace, ssr, disableSsr, globalHide, hideAll, cascade, collapseend, fadeOutEnabled, observerMode, raf } from './defaultConfigs';

const TransitionGroupContext = React.createContext();

const inOut = shape({
  make: func,
  duration: number.isRequired,
  delay: number.isRequired,
  forever: bool,
  count: number.isRequired,
  style: object.isRequired,
  reverse: bool,
});

const propTypes = {
  collapse: bool,
  collapseEl: element,
  cascade: bool,
  wait: number,
  force: bool,
  disabled: bool,
  appear: bool,
  enter: bool,
  exit: bool,
  fraction: number,
  refProp: string,
  innerRef: func,
  onReveal: func,
  unmountOnExit: bool,
  mountOnEnter: bool,
  inEffect: inOut.isRequired,
  outEffect: oneOfType([inOut, oneOf([false])]).isRequired,
  ssrReveal: bool,
  collapseOnly: bool,
  ssrFadeout: bool,
};

const defaultProps = {
  fraction: 0.2,
  refProp: 'ref',
};

class RevealBase extends React.Component {
  static contextType = TransitionGroupContext;

  constructor(props, context) {
    super(props, context);
    this.isOn = props.when !== undefined ? !!props.when : true;
    this.state = {
      collapse: props.collapse ? RevealBase.getInitialCollapseStyle(props) : void 0,
      style: {
        opacity: (!this.isOn || props.ssrReveal) && props.outEffect ? 0 : void 0,
      },
    };
    this.savedChild = false;
    this.isShown = false;
    if (!observerMode) {
      this.revealHandler = this.makeHandler(this.reveal);
      this.resizeHandler = this.makeHandler(this.resize);
    } else {
      this.handleObserve = this.handleObserve.bind(this);
    }
    this.saveRef = this.saveRef.bind(this);
  }

  saveRef(node) {
    if (this.childRef) this.childRef(node);
    if (this.props.innerRef) this.props.innerRef(node);
    if (this.el !== node) {
      this.el = node && 'offsetHeight' in node ? node : undefined;
      this.observe(this.props, true);
    }
  }

  invisible() {
    if (!this || !this.el) return;
    this.savedChild = false;
    if (!this.isShown) {
      this.setState({
        hasExited: true,
        collapse: this.props.collapse ? { ...this.state.collapse, visibility: 'hidden' } : null,
        style: { opacity: 0 },
      });
      if (!observerMode && this.props.collapse) window.document.dispatchEvent(collapseend);
    }
  }

  animationEnd(func, cascade, { forever, count, delay, duration }) {
    if (forever) return;
    const handler = () => {
      if (!this || !this.el) return;
      this.animationEndTimeout = void 0;
      func.call(this);
    };
    this.animationEndTimeout = window.setTimeout(handler, delay + (duration + (cascade ? duration : 0)) * count);
  }

  getDimensionValue() {
    return (
      this.el.offsetHeight +
      parseInt(window.getComputedStyle(this.el, null).getPropertyValue('margin-top'), 10) +
      parseInt(window.getComputedStyle(this.el, null).getPropertyValue('margin-bottom'), 10)
    );
  }

  collapse(state, props, inOut) {
    const total = inOut.duration + (props.cascade ? inOut.duration : 0),
      height = this.isOn ? this.getDimensionValue() : 0;
    let duration, delay;
    if (props.collapseOnly) {
      duration = inOut.duration / 3;
      delay = inOut.delay;
    } else {
      let delta1 = total >> 2,
        delta2 = delta1 >> 1;
      duration = delta1;
      delay = inOut.delay + (this.isOn ? 0 : total - delta1 - delta2);
      state.style.animationDuration = `${total - delta1 + (this.isOn ? delta2 : -delta2)}ms`;
      state.style.animationDelay = `${inOut.delay + (this.isOn ? delta1 - delta2 : 0)}ms`;
    }
    state.collapse = {
      height,
      transition: `height ${duration}ms ease ${delay}ms`,
      overflow: props.collapseOnly ? 'hidden' : undefined,
    };
    return state;
  }

  animate(props) {
    if (!this || !this.el) return;
    this.unlisten();
    if (this.isShown === this.isOn) return;
    this.isShown = this.isOn;
    const leaving = !this.isOn && props.outEffect,
      inOut = props[leaving ? 'outEffect' : 'inEffect'];
    let animationName = ('style' in inOut && inOut.style.animationName) || void 0;
    let state;
    if (!props.collapseOnly) {
      if ((props.outEffect || this.isOn) && inOut.make) animationName = inOut.make;
      state = {
        hasAppeared: true,
        hasExited: false,
        collapse: undefined,
        style: {
          ...inOut.style,
          animationDuration: `${inOut.duration}ms`,
          animationDelay: `${inOut.delay}ms`,
          animationIterationCount: inOut.forever ? 'infinite' : inOut.count,
          opacity: 1,
          animationName,
        },
        className: inOut.className,
      };
    } else state = { hasAppeared: true, hasExited: false, style: { opacity: 1 } };
    this.setState(props.collapse ? this.collapse(state, props, inOut) : state);
    if (leaving) {
      this.savedChild = React.cloneElement(this.getChild());
      this.animationEnd(this.invisible, props.cascade, inOut);
    } else this.savedChild = false;
    this.onReveal(props);
  }

  onReveal(props) {
    if (props.onReveal && this.isOn) {
      if (this.onRevealTimeout) this.onRevealTimeout = window.clearTimeout(this.onRevealTimeout);
      props.wait ? (this.onRevealTimeout = window.setTimeout(props.onReveal, props.wait)) : props.onReveal();
    }
  }

  componentWillUnmount() {
    this.unlisten();
    ssr && disableSsr();
  }

  handleObserve([entry], observer) {
    if (entry.intersectionRatio > 0) {
      observer.disconnect();
      this.observer = null;
      this.reveal(this.props, true);
    }
  }

  observe(props, update = false) {
    if (!this.el) return;
    if (observerMode) {
      if (this.observer) {
        if (update) this.observer.disconnect();
        else return;
      } else if (update) return;
      this.observer = new IntersectionObserver(this.handleObserve, { threshold: props.fraction });
      this.observer.observe(this.el);
    }
  }

  reveal(props, inView = false) {
    if (!globalHide) hideAll();
    if (!this || !this.el) return;
    if (!props) props = this.props;
    if (ssr) disableSsr();
    if (this.isOn && this.isShown && props.spy !== undefined) {
      this.isShown = false;
      this.setState({ style: {} });
      window.setTimeout(() => this.reveal(props), 200);
    } else if (inView || this.inViewport(props) || props.force) this.animate(props);
    else observerMode ? this.observe(props) : this.listen();
  }

  componentDidMount() {
    if (!this.el || this.props.disabled) return;
    if (!this.props.collapseOnly) {
      if ('make' in this.props.inEffect) this.props.inEffect.make(false, this.props);
      if (this.props.when !== undefined && this.props.outEffect && 'make' in this.props.outEffect) this.props.outEffect.make(true, this.props);
    }
    const parentGroup = this.context;
    const appear = parentGroup && !parentGroup.isMounting ? !('enter' in this.props && this.props.enter === false) : this.props.appear;
    if (
      this.isOn &&
      ((this.props.when !== undefined || this.props.spy !== undefined) && !appear) ||
      (ssr && !fadeOutEnabled && !this.props.ssrFadeout && this.props.outEffect && !this.props.ssrReveal && RevealBase.getTop(this.el) < window.pageYOffset + window.innerHeight)
    ) {
      this.isShown = true;
      this.setState({
        hasAppeared: true,
        collapse: this.props.collapse ? { height: this.getDimensionValue() } : this.state.collapse,
        style: { opacity: 1 },
      });
      this.onReveal(this.props);
      return;
    }
    if (ssr && (fadeOutEnabled || this.props.ssrFadeout) && this.props.outEffect && RevealBase.getTop(this.el) < window.pageYOffset + window.innerHeight) {
      this.setState({ style: { opacity: 0, transition: 'opacity 1000ms 1000ms' } });
      window.setTimeout(() => this.reveal(this.props, true), 2000);
      return;
    }
    if (this.isOn) this.props.force ? this.animate(this.props) : this.reveal(this.props);
  }

  cascade(children) {
    let newChildren;
    if (typeof children === 'string') {
      newChildren = children.split('').map((ch, index) => (
        <span key={index} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
          {ch}
        </span>
      ));
    } else newChildren = React.Children.toArray(children);
    let { duration, reverse } = this.props[this.isOn || !this.props.outEffect ? 'inEffect' : 'outEffect'],
      count = newChildren.length,
      total = duration * 2;
    if (this.props.collapse) {
      total = parseInt(this.state.style.animationDuration, 10);
      duration = total / 2;
    }
    let i = reverse ? count : 0;
    newChildren = newChildren.map((child) =>
      typeof child === 'object' && child
        ? React.cloneElement(child, {
            style: {
              ...child.props.style,
              ...this.state.style,
              animationDuration: Math.round(cascade(reverse ? i-- : i++, 0, count, duration, total)) + 'ms',
            },
          })
        : child
    );
    return newChildren;
  }

  static getInitialCollapseStyle(props) {
    return {
      height: 0,
      visibility: props.when ? void 0 : 'hidden',
    };
  }

  componentWillReceiveProps(props) {
    if (props.when !== undefined) this.isOn = !!props.when;
    if (props.fraction !== this.props.fraction) this.observe(props, true);
    if (!this.isOn && props.onExited && 'exit' in props && props.exit === false) {
      props.onExited();
      return;
    }
    if (props.disabled) return;
    if (props.collapse && !this.props.collapse) {
      this.setState({ style: {}, collapse: RevealBase.getInitialCollapseStyle(props) });
      this.isShown = false;
    }
    if (props.when !== this.props.when || props.spy !== this.props.spy) this.reveal(props);
    if (this.onRevealTimeout && !this.isOn) this.onRevealTimeout = window.clearTimeout(this.onRevealTimeout);
  }

  getChild() {
    if (this.savedChild && !this.props.disabled) return this.savedChild;
    if (typeof this.props.children === 'object') {
      const child = React.Children.only(this.props.children);
      return 'type' in child && typeof child.type === 'string' || this.props.refProp !== 'ref' ? child : <div>{child}</div>;
    } else return <div>{this.props.children}</div>;
  }

  render() {
    let mount;
    if (!this.state.hasAppeared) mount = !this.props.mountOnEnter || this.isOn;
    else mount = !this.props.unmountOnExit || !this.state.hasExited || this.isOn;
    const child = this.getChild();
    if (typeof child.ref === 'function') this.childRef = child.ref;
    let newChildren = false,
      { style, className, children } = child.props;
    let newClass = this.props.disabled ? className : `${this.props.outEffect ? namespace : ''}${this.state.className ? ' ' + this.state.className : ''}${className ? ' ' + className : ''}` || void 0,
      newStyle;
    if (typeof this.state.style.animationName === 'function') this.state.style.animationName = this.state.style.animationName(!this.isOn, this.props);
    if (this.props.cascade && !this.props.disabled && children && this.state.style.animationName) {
      newChildren = this.cascade(children);
      newStyle = { ...style, opacity: 1 };
    } else newStyle = this.props.disabled ? style : { ...style, ...this.state.style };
    const props = { ...this.props.props, className: newClass, style: newStyle, [this.props.refProp]: this.saveRef };
    const el = React.cloneElement(child, props, mount ? newChildren || children : undefined);
    if (this.props.collapse !== undefined)
      return this.props.collapseEl
        ? React.cloneElement(this.props.collapseEl, { style: { ...this.props.collapseEl.style, ...(this.props.disabled ? undefined : this.state.collapse) }, children: el })
        : <div style={this.props.disabled ? undefined : this.state.collapse} children={el} />;
    return el;
  }

  makeHandler(handler) {
    const update = () => {
      handler.call(this, this.props);
      this.ticking = false;
    };
    return () => {
      if (!this.ticking) {
        raf(update);
        this.ticking = true;
      }
    };
  }

  static getTop(el) {
    while (el.offsetTop === void 0) el = el.parentNode;
    let top = el.offsetTop;
    for (; el.offsetParent; top += el.offsetTop) el = el.offsetParent;
    return top;
  }

  inViewport(props) {
    if (!this.el || window.document.hidden) return false;
    const h = this.el.offsetHeight,
      delta = window.pageYOffset - RevealBase.getTop(this.el),
      tail = Math.min(h, window.innerHeight) * (globalHide ? props.fraction : 0);
    return delta > tail - window.innerHeight && delta < h - tail;
  }

  resize(props) {
    if (!this || !this.el || !this.isOn) return;
    if (this.inViewport(props)) {
      this.unlisten();
      this.isShown = this.isOn;
      this.setState({ hasExited: !this.isOn, hasAppeared: true, collapse: undefined, style: { opacity: this.isOn || !props.outEffect ? 1 : 0 } });
      this.onReveal(props);
    }
  }

  listen() {
    if (!observerMode && !this.isListener) {
      this.isListener = true;
      window.addEventListener('scroll', this.revealHandler, { passive: true });
      window.addEventListener('orientationchange', this.revealHandler, { passive: true });
      window.document.addEventListener('visibilitychange', this.revealHandler, { passive: true });
      window.document.addEventListener('collapseend', this.revealHandler, { passive: true });
      window.addEventListener('resize', this.resizeHandler, { passive: true });
    }
  }

  unlisten() {
    if (!observerMode && this.isListener) {
      window.removeEventListener('scroll', this.revealHandler, { passive: true });
      window.removeEventListener('orientationchange', this.revealHandler, { passive: true });
      window.document.removeEventListener('visibilitychange', this.revealHandler, { passive: true });
      window.document.removeEventListener('collapseend', this.revealHandler, { passive: true });
      window.removeEventListener('resize', this.resizeHandler, { passive: true });
      this.isListener = false;
    }
    if (this.onRevealTimeout) this.onRevealTimeout = window.clearTimeout(this.onRevealTimeout);
    if (this.animationEndTimeout) this.animationEndTimeout = window.clearTimeout(this.animationEndTimeout);
  }
}

RevealBase.propTypes = propTypes;
RevealBase.defaultProps = defaultProps;
RevealBase.displayName = 'RevealBase';

export default RevealBase;