import { Form, Button, Row, Col, Container } from 'react-bootstrap';
import './Contact.css';
import { FaArrowRight } from "react-icons/fa";
import { useEffect, useState } from 'react';

function Contact() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');

    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;

    document.body.appendChild(script);

    function updateIsMobile() {
      setIsMobile(document.documentElement.clientWidth < 992);
    }
    window.addEventListener('resize', updateIsMobile);
    updateIsMobile();

    return () => {
      window.removeEventListener('resize', updateIsMobile);
      document.body.removeChild(script);
    }
  }, []);

  return (
    <Container fluid className="ContactContainer py-5">
      <Row className='ContactRow'>
        <div className="Subtitle">Get in touch</div>
        <Col xl={6} className="ContactCol">
          <div style={{ maxWidth: '750px' }}>
            We're delighted you're interested in working with us! To get in touch, you
            can book a free consultation using the form {isMobile ? 'below' : 'on the right'}, email us at <a href="mailto:hello@northpnd.com">hello@northpnd.com</a>, or give us a call at <a href='tel:6475767112'>647-576-7112</a>.
          </div>
        </Col>
        <Col xl={6} className="FormParent">
          <div className="calendly-inline-widget ConsultationForm" data-url="https://calendly.com/jpabadir/north-p-n-d-initial-consultation?hide_event_type_details=1&hide_gdpr_banner=1&background_color=212329&text_color=ffffff"></div>
        </Col>
      </Row>
    </Container>
  );
}

export default Contact;
