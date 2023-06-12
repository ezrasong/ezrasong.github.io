import './Footer.css';
import { Form, Button, Row, Col, Container } from 'react-bootstrap';

function Footer() {
  return (
    <div className="FooterMain">
      <div className="FooterCompanyName">Ezra Song</div>
      <hr className="FooterHr" />
      <Container style={{ paddingBottom: '20px' }}>
        <Row>
          <Col xl={7} style={{ textAlign: 'left' }}>
            <br />
            Toronto, ON
            <br />
            Canada
            <br />
            <br />
          </Col>
          <Col xl={5} style={{ display: 'flex' }}>
            <div className='FooterLinks'>
              <Row style={{ padding: '3px 0px' }}>
                <Col xs={6} style={{ paddingLeft: '0px' }}>
                  <a href="https://www.linkedin.com/in/ezra-song-344100269" target="_blank" rel="noreferrer" className="FooterLink">
                    LinkedIn
                  </a>
                </Col>
              </Row>
              <Row style={{ padding: '3px 0px' }}>
                <Col xs={6} style={{ paddingLeft: '0px' }}>
                  <a href="mailto:ezrasong@gmail.com" target="_blank" rel="noreferrer" className="FooterLink">Gmail</a>
                </Col>
              </Row>
            </div>
          </Col>
        </Row>
      </Container>
    </div >
  );
}

export default Footer;
