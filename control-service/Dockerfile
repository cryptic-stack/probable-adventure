FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py

ENV CONTROL_HOST=0.0.0.0
ENV CONTROL_PORT=9001

CMD ["sh", "-lc", "uvicorn app:app --host ${CONTROL_HOST} --port ${CONTROL_PORT}"]
