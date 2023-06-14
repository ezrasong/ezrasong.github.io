import React from 'react';
import { Element, scroller } from "react-scroll";
import './MyWork.css';
import { Row, Col, Container } from 'react-bootstrap';
import DiceGame from './DiceGame';
import HangmanGame from './HangmanGame';

function MyWork() {
  return (
    <div className="pt-4">
      <Container fluid>
        <Row className="justify-content-center">
          <div className="Subtitle">My Work</div>
          <div
            style={{ width: "100%", justifyContent: "center", display: "flex" }}
          >
            <Element
              name="DiceGame"
              style={{ width: "100%", background: "rgb(48, 46, 58, 0.04)" }}
              className="d-flex justify-content-center"
            >
              <div className="element d-flex justify-content-center">
                <DiceGame />
              </div>
            </Element>
          </div>
          <div
            style={{ width: "100%", justifyContent: "center", display: "flex" }}
          >
            <Element
              name="HangmanGame"
              style={{ width: "100%", background: "rgb(48, 46, 58, 0.04)" }}
              className="d-flex justify-content-center"
            >
              <div className="element d-flex justify-content-center">
                <HangmanGame />
              </div>
            </Element>
          </div>
        </Row>
      </Container>
    </div>
  );
}

export default MyWork;
